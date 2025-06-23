export default function Spinner() {
  return (
    <div className="flex absolute bottom-0 z-50 items-center justify-center h-screen">
      <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}
