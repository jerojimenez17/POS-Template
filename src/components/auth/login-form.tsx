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
import { motion, AnimatePresence } from "framer-motion";

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
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="ejemplo@ejemplo.com"
                        type="email"
                        autoComplete="username"
                        disabled={isPending}
                        className="transition-all duration-200 focus:scale-[1.02]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </motion.div>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="current-password"
                        placeholder="Ingresa tu contraseña"
                        type="password"
                        disabled={isPending}
                        className="transition-all duration-200 focus:scale-[1.02]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </motion.div>
              )}
            />
          </div>
          <AnimatePresence mode="wait">
            {(error || urlError) && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <FormError message={error || urlError} />
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              type="submit"
              disabled={isPending}
              className="w-full transition-all duration-200"
            >
              {isPending ? (
                <motion.span
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  Iniciando sesión...
                </motion.span>
              ) : (
                "Iniciar sesión"
              )}
            </Button>
          </motion.div>
        </form>
      </Form>
    </CardWrapper>
  );
};
