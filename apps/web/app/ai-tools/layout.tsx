import AITools from '@/components/AITools/ai-tools';

export default function AIToolsLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return <AITools>{children}</AITools>;
}
