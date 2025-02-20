import { auth, signOut } from "@/auth";

const SingOut = async () => {
  const session = await auth();
  return (
    <form
      action={async () => {
        "use server";

        await signOut();
      }}
    >
      <button type="submit" className="bg-blue-200 p-2">
        Cerrar Sesion
      </button>
    </form>
  );
};

export default SingOut;
