import SideNav from "@/components/ui/SideNav";

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] overflow-hidden">
      <SideNav />
      <main className="flex-1 ml-14 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};

export default ProtectedLayout;
