"use client";

import { Card, CardContent, CardHeader } from "../ui/card";

export function SkeletonCard() {
  return (
    <Card className="w-72 animate-pulse">
      <CardHeader className="space-y-2">
        <div className="h-32 w-full bg-gray-200 rounded-lg" />
        <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto" />
        <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-8 bg-gray-200 rounded" />
        <div className="h-8 bg-gray-200 rounded" />
      </CardContent>
    </Card>
  );
}
