"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralTab } from "./tabs/GeneralTab";
import { BrandingTab } from "./tabs/BrandingTab";
import { NotificationsTab } from "./tabs/NotificationsTab";

interface ConfigTabsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialData: any;
}

export function ConfigTabs({ initialData }: ConfigTabsProps) {
  const [data, setData] = useState(initialData);

  return (
    <div className="w-full space-y-6">
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="branding">Personalización</TabsTrigger>
          <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab data={data} onUpdate={setData} />
        </TabsContent>
        <TabsContent value="branding">
          <BrandingTab data={data} onUpdate={setData} />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab data={data} onUpdate={setData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
