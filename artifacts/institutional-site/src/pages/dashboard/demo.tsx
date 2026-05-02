import { useEffect } from "react";
import { useLocation } from "wouter";

export default function DemoGateway() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    localStorage.setItem("jwt_token", "demo-token");
    localStorage.setItem("jwt_username", "Lorena");
    localStorage.setItem("jwt_role", "cliente_master");
    setLocation("/painel");
  }, [setLocation]);
  return null;
}
