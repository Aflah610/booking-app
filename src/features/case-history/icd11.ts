/**
 * Common ICD-11 MMS codes from chapter 6 (mental, behavioural or neurodevelopmental disorders), titles unchanged.
 * Source: World Health Organization, ICD-11 for Mortality and Morbidity Statistics, licensed CC BY-ND 3.0 IGO.
 * Anything not listed is recorded as "Other" with a written label.
 */
export const ICD11 = [
  { code: "6A00", title: "Disorders of intellectual development" },
  { code: "6A02", title: "Autism spectrum disorder" },
  { code: "6A05", title: "Attention deficit hyperactivity disorder" },
  { code: "6A20", title: "Schizophrenia" },
  { code: "6A21", title: "Schizoaffective disorder" },
  { code: "6A22", title: "Schizotypal disorder" },
  { code: "6A23", title: "Acute and transient psychotic disorder" },
  { code: "6A24", title: "Delusional disorder" },
  { code: "6A60", title: "Bipolar type I disorder" },
  { code: "6A61", title: "Bipolar type II disorder" },
  { code: "6A62", title: "Cyclothymic disorder" },
  { code: "6A70", title: "Single episode depressive disorder" },
  { code: "6A71", title: "Recurrent depressive disorder" },
  { code: "6A72", title: "Dysthymic disorder" },
  { code: "6A73", title: "Mixed depressive and anxiety disorder" },
  { code: "6B00", title: "Generalised anxiety disorder" },
  { code: "6B01", title: "Panic disorder" },
  { code: "6B02", title: "Agoraphobia" },
  { code: "6B03", title: "Specific phobia" },
  { code: "6B04", title: "Social anxiety disorder" },
  { code: "6B05", title: "Separation anxiety disorder" },
  { code: "6B20", title: "Obsessive-compulsive disorder" },
  { code: "6B21", title: "Body dysmorphic disorder" },
  { code: "6B23", title: "Hypochondriasis" },
  { code: "6B24", title: "Hoarding disorder" },
  { code: "6B40", title: "Post traumatic stress disorder" },
  { code: "6B41", title: "Complex post traumatic stress disorder" },
  { code: "6B42", title: "Prolonged grief disorder" },
  { code: "6B43", title: "Adjustment disorder" },
  { code: "6B80", title: "Anorexia Nervosa" },
  { code: "6B81", title: "Bulimia Nervosa" },
  { code: "6B82", title: "Binge eating disorder" },
  { code: "6C20", title: "Bodily distress disorder" },
  { code: "6C40", title: "Disorders due to use of alcohol" },
  { code: "6C41", title: "Disorders due to use of cannabis" },
  { code: "6C43", title: "Disorders due to use of opioids" },
  { code: "6C4A", title: "Disorders due to use of nicotine" },
  { code: "6C50", title: "Gambling disorder" },
  { code: "6C51", title: "Gaming disorder" },
  { code: "6D10", title: "Personality disorder" },
] as const;

export function icd11Title(code: string): string | null {
  return ICD11.find((d) => d.code === code)?.title ?? null;
}
