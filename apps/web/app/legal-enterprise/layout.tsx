import LegalEnterprise from '@/components/LegalEnterprise/legal-enterprise';

export default function LegalEnterpriseLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return <LegalEnterprise>{children}</LegalEnterprise>;
}
