import { useEffect } from "react";
import { useLocation } from "wouter";

export default function DemoGateway() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    localStorage.setItem("admin_token", "demo-token");
    localStorage.setItem("admin_username", "Lorena");
    localStorage.setItem("admin_role", "cliente_master");
    setLocation("/painel");
  }, [setLocation]);
  return null;
}
