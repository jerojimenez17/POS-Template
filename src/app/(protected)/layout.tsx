import SideNav from "@/components/ui/SideNav";
import { TrialBannerWrapper } from "@/components/plan/trial-banner-wrapper";

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] overflow-hidden">
      <SideNav />
      <main className="flex-1 ml-0 md:ml-14 overflow-y-auto">
        <TrialBannerWrapper />
        {children}
      </main>
    </div>
  );
};

export default ProtectedLayout;
