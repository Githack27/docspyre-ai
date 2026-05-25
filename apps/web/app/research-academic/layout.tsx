import ResearchAcademic from '@/components/ResearchAcademic/research-academic';

export default function ResearchAcademicLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return <ResearchAcademic>{children}</ResearchAcademic>;
}
