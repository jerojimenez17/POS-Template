export default function Spinner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 dark:bg-gray-950/50 backdrop-blur-[1px]">
      <div className="w-12 h-12 border-4 border-black dark:border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
