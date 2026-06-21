"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateBusinessConfig } from "@/actions/business-config";

interface GeneralTabProps {
  data: any;
  onUpdate: (data: any) => void;
}

export function GeneralTab({ data, onUpdate }: GeneralTabProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    defaultInvoiceDueDays: data.defaultInvoiceDueDays ?? 30,
    timezone: data.timezone ?? "America/Argentina/Buenos_Aires",
  });

  const handleSave = async () => {
    setLoading(true);
    const result = await updateBusinessConfig(form);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Configuración guardada");
      onUpdate({ ...data, ...form });
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración General</CardTitle>
        <CardDescription>Parámetros generales del negocio</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="dueDays">Días de vencimiento de factura</Label>
          <Input
            id="dueDays"
            type="number"
            value={form.defaultInvoiceDueDays}
            onChange={(e) => setForm({ ...form, defaultInvoiceDueDays: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Zona horaria</Label>
          <Input
            id="timezone"
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          />
        </div>
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Guardando..." : "Guardar cambios"}
        </Button>
      </CardContent>
    </Card>
  );
}
