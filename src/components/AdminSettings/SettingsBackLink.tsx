"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Back control for the settings screen. ArcaForm broadcasts whether there are
 * unsaved changes (form values, PEM inputs or the certificate wizard), so the
 * user must confirm before leaving and losing them.
 */
export default function SettingsBackLink() {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const handleDirty = (event: Event) => {
      setDirty(Boolean((event as CustomEvent<boolean>).detail));
    };
    window.addEventListener("arca-settings-dirty", handleDirty);
    return () => window.removeEventListener("arca-settings-dirty", handleDirty);
  }, []);

  const handleBack = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (dirty) {
      setConfirmOpen(true);
      return;
    }
    router.push("/");
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={handleBack} title="Volver">
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Hay cambios pendientes en la configuración, incluidos los certificados. Si salís ahora, se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Quedarme</AlertDialogCancel>
            <AlertDialogAction onClick={() => router.push("/")}>Salir sin guardar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
