terraform {
  required_version = ">= 1.8"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
  backend "s3" {
    bucket         = "chiroreferral-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "chiroreferral-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "chiroreferral"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

locals {
  name = "chiroreferral-${var.environment}"
}

# ── VPC ───────────────────────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = local.name
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  private_subnets = var.private_subnet_cidrs
  public_subnets  = var.public_subnet_cidrs

  enable_nat_gateway     = true
  single_nat_gateway     = var.environment != "prod"
  enable_dns_hostnames   = true
  enable_dns_support     = true
  enable_flow_log        = true
  flow_log_cloudwatch_log_group_retention_in_days = 30

  tags = {
    "kubernetes.io/cluster/${local.name}" = "shared"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"     = "1"
    "kubernetes.io/cluster/${local.name}" = "owned"
  }
  public_subnet_tags = {
    "kubernetes.io/role/elb"              = "1"
    "kubernetes.io/cluster/${local.name}" = "owned"
  }
}

# ── KMS keys ──────────────────────────────────────────────────────────────────
resource "aws_kms_key" "rds" {
  description             = "RDS encryption key"
  deletion_window_in_days = 7
}

resource "aws_kms_key" "s3" {
  description             = "S3 documents encryption key"
  deletion_window_in_days = 7
}

# ── RDS PostgreSQL ────────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "rds" {
  name   = "${local.name}-rds"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }
}

resource "aws_db_instance" "postgres" {
  identifier              = local.name
  engine                  = "postgres"
  engine_version          = "15.6"
  instance_class          = var.db_instance_class
  allocated_storage       = 100
  max_allocated_storage   = 1000
  storage_encrypted       = true
  kms_key_id              = aws_kms_key.rds.arn
  db_name                 = "chiroreferral"
  username                = "app_service"
  manage_master_user_password = true
  multi_az                = var.environment == "prod"
  publicly_accessible     = false
  vpc_security_group_ids  = [aws_security_group.rds.id]
  db_subnet_group_name    = aws_db_subnet_group.main.name
  backup_retention_period = var.environment == "prod" ? 7 : 1
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"
  deletion_protection     = var.environment == "prod"
  skip_final_snapshot     = var.environment != "prod"
  performance_insights_enabled = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  parameter_group_name    = aws_db_parameter_group.postgres15.name
}

resource "aws_db_parameter_group" "postgres15" {
  name   = "${local.name}-postgres15"
  family = "postgres15"

  parameter {
    name  = "log_statement"
    value = "ddl"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
}

# Read replica (prod only)
resource "aws_db_instance" "postgres_replica" {
  count                = var.environment == "prod" ? 1 : 0
  identifier           = "${local.name}-replica"
  replicate_source_db  = aws_db_instance.postgres.identifier
  instance_class       = var.db_replica_instance_class
  publicly_accessible  = false
  storage_encrypted    = true
  deletion_protection  = false
  skip_final_snapshot  = true
}

# ── ElastiCache Redis ─────────────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "redis" {
  name   = "${local.name}-redis"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }
}

# Cache cluster (volatile-lru)
resource "aws_elasticache_replication_group" "cache" {
  replication_group_id       = "${local.name}-cache"
  description                = "ChiroReferral cache cluster"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.environment == "prod" ? 3 : 1
  engine_version             = "7.1"
  port                       = 6379
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_cache_auth.result
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  automatic_failover_enabled = var.environment == "prod"
  parameter_group_name       = "default.redis7.cluster.on"
}

# Queue cluster (noeviction — BullMQ)
resource "aws_elasticache_replication_group" "queue" {
  replication_group_id       = "${local.name}-queue"
  description                = "ChiroReferral BullMQ queue cluster (noeviction)"
  node_type                  = var.redis_node_type
  num_cache_clusters         = var.environment == "prod" ? 3 : 1
  engine_version             = "7.1"
  port                       = 6379
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_queue_auth.result
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  automatic_failover_enabled = var.environment == "prod"
}

resource "random_password" "redis_cache_auth" {
  length  = 32
  special = false
}

resource "random_password" "redis_queue_auth" {
  length  = 32
  special = false
}

# ── S3 ────────────────────────────────────────────────────────────────────────
resource "aws_s3_bucket" "documents" {
  bucket        = "chiroreferral-documents-${var.environment}"
  force_destroy = var.environment != "prod"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Cross-region replication (prod only)
resource "aws_s3_bucket_replication_configuration" "documents" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.documents.id
  role   = aws_iam_role.s3_replication[0].arn

  rule {
    id     = "replicate-to-dr"
    status = "Enabled"

    destination {
      bucket        = "arn:aws:s3:::chiroreferral-documents-${var.environment}-dr"
      storage_class = "STANDARD_IA"
    }
  }
}

# ── EKS cluster ───────────────────────────────────────────────────────────────
resource "aws_security_group" "eks_nodes" {
  name   = "${local.name}-eks-nodes"
  vpc_id = module.vpc.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = local.name
  cluster_version = "1.30"
  subnet_ids      = module.vpc.private_subnets
  vpc_id          = module.vpc.vpc_id

  cluster_endpoint_public_access = true

  eks_managed_node_groups = {
    general = {
      min_size       = var.environment == "prod" ? 3 : 1
      max_size       = var.environment == "prod" ? 20 : 3
      desired_size   = var.environment == "prod" ? 3 : 1
      instance_types = [var.eks_instance_type]
      capacity_type  = "ON_DEMAND"

      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 50
            volume_type           = "gp3"
            encrypted             = true
            kms_key_id            = aws_kms_key.rds.arn
            delete_on_termination = true
          }
        }
      }
    }
  }

  # IRSA for External Secrets Operator and Cluster Autoscaler
  enable_cluster_creator_admin_permissions = true
}

# ── Secrets Manager (store sensitive config) ─────────────────────────────────
resource "aws_secretsmanager_secret" "app_secrets" {
  for_each = {
    "database-url"          = "PostgreSQL connection string"
    "redis-url"             = "Redis cache URL"
    "redis-queue-url"       = "Redis queue URL"
    "jwt-secret"            = "JWT signing secret"
    "stripe-secret-key"     = "Stripe secret key"
    "stripe-webhook-secret" = "Stripe webhook signing secret"
    "sendgrid-api-key"      = "SendGrid API key"
    "sendgrid-from-email"   = "SendGrid from email"
    "google-maps-api-key"   = "Google Maps API key"
    "feedback-token-secret" = "HMAC secret for feedback tokens"
  }

  name        = "chiroreferral/${var.environment}/${each.key}"
  description = each.value

  recovery_window_in_days = var.environment == "prod" ? 7 : 0
}

# ── Placeholder IAM roles (referenced above) ─────────────────────────────────
resource "aws_iam_role" "s3_replication" {
  count = var.environment == "prod" ? 1 : 0
  name  = "${local.name}-s3-replication"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "s3.amazonaws.com" }
    }]
  })
}

# ── Outputs ───────────────────────────────────────────────────────────────────
output "eks_cluster_name" {
  value = module.eks.cluster_name
}

output "rds_endpoint" {
  value     = aws_db_instance.postgres.endpoint
  sensitive = true
}

output "redis_cache_endpoint" {
  value     = aws_elasticache_replication_group.cache.primary_endpoint_address
  sensitive = true
}

output "s3_documents_bucket" {
  value = aws_s3_bucket.documents.id
}

output "vpc_id" {
  value = module.vpc.vpc_id
}
