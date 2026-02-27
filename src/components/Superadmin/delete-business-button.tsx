"use client";

import { useTransition } from "react";
import { deleteBusiness } from "@/actions/superadmin";
import { Button } from "@/components/ui/button";

interface DeleteBusinessButtonProps {
    businessId: string;
}

export const DeleteBusinessButton = ({ businessId }: DeleteBusinessButtonProps) => {
    const [isPending, startTransition] = useTransition();

    const onClick = () => {
        if (!confirm("Are you sure you want to delete this business? This action cannot be undone.")) return;
        
        startTransition(() => {
            deleteBusiness(businessId)
                .then((data) => {
                    if (data.error) {
                        alert(data.error);
                    }
                    if (data.success) {
                       // Toast or refresh handled by server action revalidatePath, but visual feedback nice
                    }
                })
        });
    };

    return (
        <Button 
            variant="destructive" 
            size="sm" 
            onClick={onClick}
            disabled={isPending}
        >
            {isPending ? "Eliminando..." : "Eliminar"}
        </Button>
    );
};
