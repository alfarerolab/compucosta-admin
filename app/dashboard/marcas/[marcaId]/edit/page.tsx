import ProductForm from "@/components/forms/product-form";

interface Props {
  params: Promise<{ marcaId: string }>;
}

export default async function EditMarcaPage({ params }: Props) {
  const { marcaId } = await params;
  const product = await fetch(`/api/marcas/${marcaId}`).then(res => res.json());
  
  return <ProductForm initialData={product} />;
}