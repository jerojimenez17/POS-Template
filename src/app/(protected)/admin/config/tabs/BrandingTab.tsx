"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateBusinessConfig } from "@/actions/business-config";

interface BrandingTabProps {
  data: any;
  onUpdate: (data: any) => void;
}

export function BrandingTab({ data, onUpdate }: BrandingTabProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    brandPrimaryColor: data.brandPrimaryColor ?? "#2563eb",
    brandSecondaryColor: data.brandSecondaryColor ?? "#f59e0b",
    brandLogo: data.brandLogo ?? "",
  });

  const handleSave = async () => {
    setLoading(true);
    const result = await updateBusinessConfig(form);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Personalización guardada");
      onUpdate({ ...data, ...form });
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personalización</CardTitle>
        <CardDescription>Colores y logo del negocio</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="logo">URL del logo</Label>
          <Input
            id="logo"
            value={form.brandLogo}
            onChange={(e) => setForm({ ...form, brandLogo: e.target.value })}
            placeholder="https://..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="primaryColor">Color primario</Label>
          <div className="flex gap-2 items-center">
            <Input
              id="primaryColor"
              type="color"
              value={form.brandPrimaryColor}
              onChange={(e) => setForm({ ...form, brandPrimaryColor: e.target.value })}
              className="w-12 h-10 p-1"
            />
            <span className="text-sm text-muted-foreground">{form.brandPrimaryColor}</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="secondaryColor">Color secundario</Label>
          <div className="flex gap-2 items-center">
            <Input
              id="secondaryColor"
              type="color"
              value={form.brandSecondaryColor}
              onChange={(e) => setForm({ ...form, brandSecondaryColor: e.target.value })}
              className="w-12 h-10 p-1"
            />
            <span className="text-sm text-muted-foreground">{form.brandSecondaryColor}</span>
          </div>
        </div>
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Guardando..." : "Guardar cambios"}
        </Button>
      </CardContent>
    </Card>
  );
}
