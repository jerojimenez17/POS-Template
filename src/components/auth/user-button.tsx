"use client";

import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  Avatar, 
  AvatarImage, 
  AvatarFallback 
} from "@/components/ui/avatar";
import { useSession, signOut } from "next-auth/react";
import { closeSession } from "@/actions/cashbox";
import { FaUser } from "react-icons/fa";
import { ExitIcon } from "@radix-ui/react-icons";

export const UserButton = () => {
  const { data: session } = useSession();
  const user = session?.user;

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none">
        <Avatar className="h-8 w-8 cursor-pointer ring-slate-200 dark:ring-gray-700 hover:ring-2 transition-all">
          <AvatarImage src={user?.image || ""} alt={user?.name || "User"} />
          <AvatarFallback className="bg-slate-200 dark:bg-gray-700">
            <FaUser className="text-slate-600 dark:text-gray-300" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-40" align="end">
        <div className="px-2 py-1.5 text-sm font-medium border-b border-slate-100 dark:border-gray-800 mb-1">
          {user?.name || "Usuario"}
        </div>
        <DropdownMenuItem 
          onClick={async () => {
            // Close cashbox session if exists before signing out
            await closeSession();
            signOut();
          }}
          className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/10"
        >
          <ExitIcon className="h-4 w-4 mr-2" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
