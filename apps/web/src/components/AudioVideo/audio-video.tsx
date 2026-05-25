interface AudioVideoProps {
  children?: React.ReactNode;
}

export default function AudioVideo({ children }: AudioVideoProps) {
  return (
    <div className="audio-video-container">
      {children || (
        <div>
          <h1>Audio & Video Tools</h1>
          <p>Select a tool from the sidebar to get started.</p>
        </div>
      )}
    </div>
  );
}
