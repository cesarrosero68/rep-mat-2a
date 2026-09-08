import * as Icons from "lucide-react";
import type { LucideProps } from "lucide-react";

type Props = LucideProps & { name: string };

export function SubjectIcon({ name, ...props }: Props) {
  const registry = Icons as unknown as Record<
    string,
    React.ComponentType<LucideProps>
  >;
  const Cmp = registry[name] ?? Icons.BookOpen;
  return <Cmp {...props} />;
}
