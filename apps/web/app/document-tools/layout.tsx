import DocumentTools from '@/components/DocumentTools/document-tools';

export default function DocumentToolsLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return <DocumentTools>{children}</DocumentTools>;
}
