import { ReactElement } from "react";
import { Header } from "../ui/header";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

interface props {
  children: ReactElement;
  className?: string;
}
const StockPanel = ({ children, className }: props) => {
  return (
    <div className={`${className !== undefined ? className : ""}`}>
      <Card className="w-96 shadow-md max-h-1/2 bg-gray backdrop-filter backdrop-blur-3xl backdrop-brightness-110">
        <CardHeader>
          <Header label={"Stock"} />
        </CardHeader>
        <CardContent>{children}</CardContent>

        <CardFooter>
          {/* <BackButton href={backButtonHref} label={backButtonLabel} /> */}
        </CardFooter>
      </Card>
    </div>
  );
};

export default StockPanel;
