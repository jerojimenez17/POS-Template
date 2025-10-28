"use client";

import { FcGoogle } from "react-icons/fc";
import { Button } from "../ui/button";
import { signIn } from "next-auth/react";
import { DEFAULT_LOGIN_REDIRECT } from "../../../routes";
import { useState } from "react";

export const Social = () => {
  const [loading, setLoading] = useState(false);
  const onClick = async (provider: "google" | "github" | "facebook") => {
    setLoading(true);
    await signIn(provider, {
      callbackUrl: DEFAULT_LOGIN_REDIRECT,
    });
    setLoading(false);
  };
  return (
    <div className="flex items-center w-full gap-x-2">
      <Button
        size="lg"
        className="w-full"
        variant="outline"
        disabled={loading}
        onClick={() => onClick("google")}
      >
        <FcGoogle className="h-5 w-5" />
      </Button>
      {/* <Button
        size="lg"
        className="w-full"
        variant="outline"
        onClick={() => onClick("github")}
      >
        <FaGithub className="h-5 w-5" />
      </Button> */}
      {/* <Button
        size="lg"
        className="w-full"
        variant="outline"
        onClick={() => onClick("facebook")}
      >
        <FaFacebook className="h-5 w-5" />
      </Button> */}
    </div>
  );
};
