const AuthLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">{children}</div>
  );
};
export default AuthLayout;
