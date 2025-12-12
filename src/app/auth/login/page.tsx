import { LoginForm } from "@/components/auth/login-form";
import Spinner from "@/components/ui/Spinner";
import React, { Suspense } from "react";

const LoginPage = () => {
  return     <Suspense fallback={<Spinner/>}>
      <LoginForm />
    </Suspense>;
};

export default LoginPage;
