interface LegalEnterpriseProps {
  children?: React.ReactNode;
}

export default function LegalEnterprise({ children }: LegalEnterpriseProps) {
  return (
    <div className="legal-enterprise-container">
      {children || (
        <div>
          <h1>Legal & Enterprise Tools</h1>
          <p>Select a tool from the sidebar to get started.</p>
        </div>
      )}
    </div>
  );
}
