import { Suspense } from "react";
import ProductForm from "@/components/forms/product-form";

export default function NewProductPage() {
  return (
    <Suspense>
      <ProductForm />
    </Suspense>
  );
}