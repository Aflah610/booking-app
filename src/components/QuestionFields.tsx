import type { Question } from "@/features/catalog/questions";

/** The extra questions a service asks, as form fields named q_<id> (read back by `answersFromForm`). */
export function QuestionFields({ questions }: { questions: Question[] }) {
  return (
    <>
      {questions.map((q) => (
        <div key={q.id} className={q.type === "longtext" ? "sm:col-span-2" : undefined}>
          <label className="label" htmlFor={`q_${q.id}`}>{q.label}{q.required && <span className="text-red-700"> *</span>}</label>
          {q.type === "longtext" ? (
            <textarea className="input" id={`q_${q.id}`} name={`q_${q.id}`} rows={3} required={q.required} />
          ) : q.type === "choice" ? (
            <select className="input" id={`q_${q.id}`} name={`q_${q.id}`} required={q.required} defaultValue="">
              <option value="" disabled={q.required}>{q.required ? "Choose…" : "–"}</option>
              {q.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input className="input" id={`q_${q.id}`} name={`q_${q.id}`} required={q.required} />
          )}
        </div>
      ))}
    </>
  );
}
