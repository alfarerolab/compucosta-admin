import ColorForm from "@/components/forms/color-form";

const NewColorPage = () => {
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4">
        <ColorForm />
      </div>
    </div>
  );
};

export default NewColorPage;