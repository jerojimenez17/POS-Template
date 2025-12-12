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
import { motion, AnimatePresence } from "framer-motion";

export const RegisterForm = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState<string | undefined>("");
  const [error, setError] = useState<string | undefined>("");

  const form = useForm<z.infer<typeof RegisterSchema>>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { email: "", password: "", name: "" },
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
              name="name"
              render={({ field }) => (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                >
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
                </motion.div>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
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
                  transition={{ delay: 0.3 }}
                >
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
                </motion.div>
              )}
            />
          </div>
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <FormError message={error} />
              </motion.div>
            )}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <FormSuccess message={success} />
              </motion.div>
            )}
          </AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
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
                  Creando cuenta...
                </motion.span>
              ) : (
                "Crear cuenta"
              )}
            </Button>
          </motion.div>
        </form>
      </Form>
    </CardWrapper>
  );
};
