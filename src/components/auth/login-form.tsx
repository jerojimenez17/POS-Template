"use client";
import { CardWrapper } from "./card-wrapper";
import { Suspense } from "react";
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
import { FormSuccess } from "../ui/form-success";
import { login } from "../actions/login";
import { Social } from "./social";
import { useSearchParams } from "next/navigation";

export const LoginForm = () => {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState<string | undefined>("");
  const [error, setError] = useState<string | undefined>("");

  const form = useForm<z.infer<typeof LoginSchema>>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });
  const onSubmit = (values: z.infer<typeof LoginSchema>) => {
    setError("");
    setSuccess("");
    startTransition(() => {
      login(values).then((data) => {
        setError(data?.error);
        // setSuccess(data?.success);
      });
    });
  };

  const SearchParamsHandler = ({
    setError,
  }: {
    setError: (msg: string) => void;
  }) => {
    const searchParams = useSearchParams();
    const urlError =
      searchParams.get("error") === "OAuthAccountNotLinked"
        ? "El email ya está en uso con credenciales"
        : "";

    setError(urlError);
    return null; // No renderiza nada, solo actualiza el estado
  };
  return (
    <CardWrapper
      headerLabel="Bienvenido!"
      backButtonLabel="No tenes una cuenta?"
      backButtonHref="/auth/register"
    >
      <Suspense fallback={null}>
        <SearchParamsHandler setError={setError} />
      </Suspense>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
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
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoComplete="current-password"
                      placeholder=""
                      type="password"
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {error && <FormError message={error} />}
          {success && <FormSuccess message={success} />}
          <Button type="submit" disabled={isPending} className="w-full">
            Login
          </Button>
        </form>
      </Form>
      <Social />
    </CardWrapper>
  );
};
