/** A small gold smiley for the login corner: it bobs gently, blinks, and its smile widens now and then. Pure CSS, still when motion is reduced. */
export function LoginSmile() {
  return (
    <svg className="login-smile" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="#e9be65" />
      <circle cx="32" cy="32" r="28" fill="none" stroke="#253d34" strokeWidth="2.5" />
      <g className="login-smile-eyes" fill="#253d34">
        <ellipse cx="23" cy="26" rx="3" ry="4" />
        <ellipse cx="41" cy="26" rx="3" ry="4" />
      </g>
      <path className="login-smile-mouth" d="M20 38 Q32 48 44 38" fill="none" stroke="#253d34" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="37" r="3.5" fill="#e48f6c" opacity=".45" />
      <circle cx="48" cy="37" r="3.5" fill="#e48f6c" opacity=".45" />
    </svg>
  );
}
