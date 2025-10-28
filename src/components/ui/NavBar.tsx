/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
// const NavBar = () => {
//   return (
//     <div className="flex mx-auto opacity-90 shadow-sm h-14 w-full justify-between px-4 py-5">
//       <section className="flex justify-between">
//         <span className="text-white font-bold text-2xl">Genesis</span>
//       </section>
//       <ul className="justify-center flex grow">
//         <li className="justify-center items-center hover:shadow-inner hover:shadow-white py-2 align-baseline">
//           <Link href="/stock">
//             <p className="text-center text-white font-semibold ">Stock</p>
//           </Link>
//         </li>
//       </ul>
//     </div>
//   );
// };

// export default NavBar;

import { cn } from "@/lib/utils";
import { NavigationMenuLink } from "@/components/ui/navigation-menu";
import { Poppins } from "next/font/google";
import React from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

const components: { title: string; href: string; description: string }[] = [
  // {
  //   title: "Cargar Productos",
  //   href: "/stock/newproduct",
  //   description: "Agrega nuevos productos a tu stock",
  // },
  {
    title: "Tabla de Productos",
    href: "/stock/productsDashboard",
    description: "Administra los productos de tu stock",
  },
];
const componentsPedidos: {
  title: string;
  href: string;
  description: string;
}[] = [
  {
    title: "Pedidos",
    href: "/orders",
    description: "Chequea y administra tus pedidos",
  },
];

const font = Poppins({
  subsets: ["latin"],
  weight: ["600"],
});
export function NavigationMenuHeader() {
  return (
    <div
      className={cn(
        `w-screen items-center h-12 shadow-md shadow-gray-400 relative flex justify-center  align-middle`,
        font.className
      )}
    >
      <div className="flex grow w-full text-center">
        <span
          className={cn(
            `text-center text-2xl font-semibold text-gray-800 mx-auto my-2`,
            font.className
          )}
        >
          <Link href="/">
            <h1 className="mx-auto dark:text-gray-50">Nombre</h1>
          </Link>
          {/* <Image
            className={`w-32 h-12 antialiased`}
            height={100}
            style={{ objectFit: "none" }}
            width={100}
            src={
              "https://firebasestorage.googleapis.com/v0/b/vcda-app.appspot.com/o/logoRoot2.png?alt=media&token=428dc1cd-26b0-4516-8f5b-f656b89d028b"
            }
            alt="VCD"
          /> */}
        </span>
      </div>
      {/* <NavigationMenu className="my-1 p-1 h-10 z-50 w-18">
        <NavigationMenuList>
          {true && (
            <NavigationMenuItem className="">
              <NavigationMenuTrigger className="backdrop-filter backdrop-blur-xl bg-gray font-bold text-black hover:bg-gray hover:backdrop-filter hover:backdrop-blur-sm ">
                Stock
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-52 gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                  {components.map((component) => (
                    <ListItem
                      className="font-semibold"
                      key={component.title}
                      title={component.title}
                      href={component.href}
                    >
                      {component.description}
                    </ListItem>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          )}
          <NavigationMenuItem>
            <NavigationMenuTrigger className="bg-gray backdrop-filter backdrop-blur-xl font-bold text-black hover:bg-gray hover:backdrop-filter hover:backdrop-blur-lg">
              Pedidos
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-52 gap-3 p-4 md:w-[500px] z-50 md:grid-cols-2 lg:w-[600px] ">
                {componentsPedidos.map((component) => (
                  <ListItem
                    className="font-bold text-lg"
                    key={component.title}
                    title={component.title}
                    href={component.href}
                  >
                    {component.description}
                  </ListItem>
                ))}
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu> */}
      <div className="mr-4 my-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className
          )}
          {...props}
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";
