import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";

const steps = [
  { label: "Complete Profile", status: "PENDING_PROFILE", path: "/profile" },
  { label: "Upload Documents", status: "PROFILE_COMPLETED", path: "/documents" },
];

const statusToIndex: Record<string, number> = {
  PENDING_PROFILE: 0,
  PROFILE_COMPLETED: 1,
  PENDING_APPROVAL: 2,
  ACTIVE: 3,
};

export default function OnboardingSteps({ status }: { status: string | undefined }) {
  const navigate = useNavigate();
  const currentIndex = status !== undefined ? (statusToIndex[status] ?? 0) : 0;

  return (
    <div className="w-full px-4 py-6">
      <div className="flex items-start justify-between">
        {steps.map((step, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isUpcoming = index > currentIndex;
          const isClickable = index <= currentIndex || status === "ACTIVE" || status === "SUSPENDED" || status === "PROFILE_COMPLETED";

          const handleStepClick = () => {
            if (isClickable) {
              navigate(step.path);
            }
          };

          return (
            <div
              key={step.status}
              onClick={handleStepClick}
              className={`flex flex-1 flex-col items-center ${isClickable ? "cursor-pointer group" : ""}`}
            >
              {/* Row: connector line + circle + connector line */}
              <div className="flex w-full items-center">
                {/* Left connector line */}
                {index === 0 ? (
                  <div className="flex-1" />
                ) : (
                  <div
                    className={`h-0.5 flex-1 ${
                      isDone || isCurrent ? "bg-sky-600" : "bg-gray-300"
                    }`}
                  />
                )}

                {/* Circle */}
                <div
                  className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors
                    ${isDone ? "border-sky-600 bg-sky-600 group-hover:bg-sky-700 group-hover:border-sky-700" : ""}
                    ${isCurrent ? "border-sky-600 bg-sky-600 group-hover:bg-sky-700 group-hover:border-sky-700" : ""}
                    ${isUpcoming ? "border-gray-300 bg-white" : ""}
                  `}
                >
                  {isDone ? (
                    <Check className="h-4 w-4 text-white" strokeWidth={3} />
                  ) : (
                    <span
                      className={`text-sm font-semibold leading-none ${
                        isCurrent ? "text-white" : "text-gray-400"
                      }`}
                    >
                      {index + 1}
                    </span>
                  )}
                </div>

                {/* Right connector line */}
                {index === steps.length - 1 ? (
                  <div className="flex-1" />
                ) : (
                  <div
                    className={`h-0.5 flex-1 ${
                      index < currentIndex ? "bg-sky-600" : "bg-gray-300"
                    }`}
                  />
                )}
              </div>

              {/* Label */}
              <p
                className={`mt-2 text-center text-xs font-medium leading-tight sm:text-sm transition-colors ${
                  isDone ? "text-sky-600 group-hover:text-sky-700" : ""
                } ${isCurrent ? "text-sky-600 group-hover:text-sky-700" : ""} ${
                  isUpcoming ? "text-gray-400" : ""
                }`}
              >
                <span className="hidden sm:inline">{step.label}</span>
                <span className="sm:hidden">Step {index + 1}</span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Mobile: show full label for current step below the stepper */}
      {currentIndex < steps.length && (
        <p className="mt-3 text-center text-sm font-semibold text-sky-600 sm:hidden">
          {steps[currentIndex]?.label}
        </p>
      )}
    </div>
  );
}
