import { timezoneOptions } from "@/lib/timezones";

export function TimezoneSelect({ id = "timezone", name = "timezone", value }: { id?: string; name?: string; value?: string }) {
  const options = timezoneOptions(value);
  return (
    <select className="input" id={id} name={name} defaultValue={value ?? options[0]}>
      {options.map((z) => (
        <option key={z} value={z}>{z === "Asia/Kolkata" ? "India (Asia/Kolkata)" : z.replace(/_/g, " ")}</option>
      ))}
    </select>
  );
}
