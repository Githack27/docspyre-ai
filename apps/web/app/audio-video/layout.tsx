import AudioVideo from '@/components/AudioVideo/audio-video';

export default function AudioVideoLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return <AudioVideo>{children}</AudioVideo>;
}
