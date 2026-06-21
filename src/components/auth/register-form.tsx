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
import { RegisterSchema } from "@/schemas";
import * as z from "zod";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useState, useTransition } from "react";
import { register } from "../actions/register";
import { useRouter } from "next/navigation";
import { FormError } from "../ui/form-error";
import { FormSuccess } from "../ui/form-success";


export const RegisterForm = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState<string | undefined>("");
  const [error, setError] = useState<string | undefined>("");

  const form = useForm<z.infer<typeof RegisterSchema>>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { email: "", password: "", registerName: "", businessName: "" },
  });
  const onSubmit = (values: z.infer<typeof RegisterSchema>) => {
    setError("");
    setSuccess("");
    startTransition(() => {
      register(values).then((data) => {
        if (data.error) {
          setError(data.error);
        }
        if (data.success) {
          setSuccess(data.success);
          router.push("/auth/login");
        }
      });
    });
  };
  return (
    <CardWrapper
      headerLabel="Crea una cuenta"
      backButtonLabel="Ya tenes una cuenta?"
      backButtonHref="/auth/login"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="registerName"
              render={({ field }) => (
                <div>
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Juan Perez"
                        autoComplete="name"
                        disabled={isPending}
                        className="transition-all duration-200 focus:scale-[1.02]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </div>
              )}
            />
            <FormField
              control={form.control}
              name="businessName"
              render={({ field }) => (
                <div>
                  <FormItem>
                    <FormLabel>Nombre del Negocio</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Mi Negocio S.A."
                        disabled={isPending}
                        className="transition-all duration-200 focus:scale-[1.02]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </div>
              )}
            />
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
                        placeholder="example@example.com"
                        type="email"
                        autoComplete="username"
                        disabled={isPending}
                        className="transition-all duration-200 focus:scale-[1.02]"
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
                        autoComplete="new-password"
                        placeholder="Mínimo 8 caracteres"
                        type="password"
                        disabled={isPending}
                        className="transition-all duration-200 focus:scale-[1.02]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </div>
              )}
            />
          </div>
          {error && (
            <div className="transition-opacity duration-200">
              <FormError message={error} />
            </div>
          )}
          {success && (
            <div className="transition-opacity duration-200">
              <FormSuccess message={success} />
            </div>
          )}
          <div>
            <Button
              type="submit"
              disabled={isPending}
              className="w-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              {isPending ? (
                <span className="animate-pulse">
                  Creando cuenta...
                </span>
              ) : (
                "Crear cuenta"
              )}
            </Button>
          </div>
        </form>
      </Form>
    </CardWrapper>
  );
};
