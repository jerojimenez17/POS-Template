import { Header } from "../ui/header";
import { BackButton } from "./back-button";
import { Card, CardFooter, CardHeader } from "../ui/card";

const ErrorCard = () => {
  return (
    <Card className="w-[400px] shadow-md">
      <CardHeader>
        <Header label="Ups! Algo salio mal" />
      </CardHeader>
      <CardFooter>
        <BackButton label="Volver a login" href="/auth/login" />
      </CardFooter>
    </Card>
  );
};

export default ErrorCard;
