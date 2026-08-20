import ProductForm from "@/components/forms/product-form";

interface Props {
  params: Promise<{ categoriesId: string }>;
}

export default async function EditCategoryPage({ params }: Props) {
  const { categoriesId } = await params;
  const product = await fetch(`/api/categories/${categoriesId}`).then(res => res.json());
  
  return <ProductForm initialData={product} />;
}