import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type Product } from "@/types/Product";

type SortableItemProps = {
  product: Product;
  children: ReturnType<typeof useSortable> extends infer R
    ? (props: {
        attributes: R extends { attributes: infer A } ? A : never;
        listeners: R extends { listeners: infer L } ? L : never;
        isDragging: boolean;
      }) => React.ReactNode
    : never;
};

export default function SortableItem({ product, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners, isDragging })}
    </div>
  );
}
