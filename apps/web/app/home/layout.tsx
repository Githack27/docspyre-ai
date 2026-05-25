import Home from '@/components/Home/home';

export default function HomeLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return <Home>{children}</Home>;
}
