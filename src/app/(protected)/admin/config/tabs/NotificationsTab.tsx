"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateBusinessConfig } from "@/actions/business-config";

interface NotificationsTabProps {
  data: any;
  onUpdate: (data: any) => void;
}

export function NotificationsTab({ data, onUpdate }: NotificationsTabProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    enableCustomerNotifications: data.enableCustomerNotifications ?? false,
    enableLowStockAlerts: data.enableLowStockAlerts ?? false,
    lowStockThreshold: data.lowStockThreshold ?? 10,
  });

  const handleSave = async () => {
    setLoading(true);
    const result = await updateBusinessConfig(form);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Notificaciones guardadas");
      onUpdate({ ...data, ...form });
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notificaciones</CardTitle>
        <CardDescription>Configuración de alertas y notificaciones</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="customerNotif">Notificaciones al cliente</Label>
          <Switch
            id="customerNotif"
            checked={form.enableCustomerNotifications}
            onCheckedChange={(v) => setForm({ ...form, enableCustomerNotifications: v })}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="lowStock">Alertas de stock bajo</Label>
          <Switch
            id="lowStock"
            checked={form.enableLowStockAlerts}
            onCheckedChange={(v) => setForm({ ...form, enableLowStockAlerts: v })}
          />
        </div>
        {form.enableLowStockAlerts && (
          <div className="space-y-2">
            <Label htmlFor="stockThreshold">Umbral de stock bajo</Label>
            <Input
              id="stockThreshold"
              type="number"
              value={form.lowStockThreshold}
              onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })}
            />
          </div>
        )}
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Guardando..." : "Guardar cambios"}
        </Button>
      </CardContent>
    </Card>
  );
}
