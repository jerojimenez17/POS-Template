"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { promoteToAdmin } from "@/actions/superadmin";
import { useTransition } from "react";

interface PromoteProps {
  userId: string;
  currentRole: string; // or UserRole
  hasBusiness: boolean;
}

export const PromoteUserButton = ({ userId, currentRole, hasBusiness }: PromoteProps) => {
  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [isPending, startTransition] = useTransition();

  if (hasBusiness || currentRole === "ADMIN" || currentRole === "SUPER_ADMIN") {
    return <Button variant="ghost" disabled>Already Admin/Linked</Button>;
  }

  const handlePromote = () => {
    if (!businessName || !slug) return;

    startTransition(() => {
        promoteToAdmin(userId, businessName, slug)
            .then((data) => {
                if (data.error) {
                    console.error(data.error);
                    // toast.error(data.error);
                    alert(data.error); // Fallback
                } else {
                    // toast.success(data.success);
                    setOpen(false);
                }
            });
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">Promote to Admin</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Business</DialogTitle>
          <DialogDescription>
            Enter details to create a business for this user. This will promote them to ADMIN.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="col-span-3"
              disabled={isPending}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="slug" className="text-right">
              Slug
            </Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="col-span-3"
              placeholder="unique-id"
              disabled={isPending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handlePromote} disabled={isPending}>
            {isPending ? "Creating..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
