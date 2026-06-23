"use client";
import { CardWrapper } from "./card-wrapper";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { LoginSchema } from "@/schemas";
import * as z from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "../ui/button";
import { useState, useTransition } from "react";
import { FormError } from "../ui/form-error";
import { login } from "../actions/login";
import { useSearchParams } from "next/navigation";

export const LoginForm = () => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>("");

  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const urlError =
    searchParams.get("error") === "OAuthAccountNotLinked"
      ? "El email ya está en uso con otro proveedor"
      : "";

  const form = useForm<z.infer<typeof LoginSchema>>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: z.infer<typeof LoginSchema>) => {
    setError("");
    startTransition(() => {
      login(values, callbackUrl).then((data) => {
        if (data?.error) {
          setError(data.error);
        }
        if (data?.success) {
          window.location.href = data.redirectTo || "/";
        }
      });
    });
  };
  return (
    <CardWrapper
      headerLabel="Bienvenido!"
      backButtonLabel="No tenes una cuenta?"
      backButtonHref="/auth/register"
      showSocial={true}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <div>
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="ejemplo@ejemplo.com"
                        type="email"
                        autoComplete="username"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </div>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <div>
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="current-password"
                        placeholder="Ingresa tu contraseña"
                        type="password"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </div>
              )}
            />
          </div>
          {(error || urlError) && (
            <div className="transition-opacity duration-200">
              <FormError message={error || urlError} />
            </div>
          )}
          <Button
            type="submit"
            disabled={isPending}
            className="w-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            {isPending ? (
              <span className="animate-pulse">
                Iniciando sesión...
              </span>
            ) : (
              "Iniciar sesión"
            )}
          </Button>
        </form>
      </Form>
    </CardWrapper>
  );
};
