// Frontend: the Cover & Remark section that closes every entry form, shared
// by every type's Add and Modify body.
//
// `ownerId` is the entry's id on Modify and absent on Add. With it,
// ImagePicker attaches a picked image to the existing row straight away;
// without it there is no row to attach to yet (see ImagePicker's module
// comment), so the picked image's id is kept as `pending_image_id` for the Add
// page to attach once the entry is saved. On Modify that key is reset to null,
// so nothing is attached twice.
import ImagePicker from "./ImagePicker";
import { Field, SectionHeader, inputCls } from "./FormField";

export default function CoverRemarkFields({ f, u, ownerType, ownerId }) {
  return (
    <>
      <SectionHeader icon="fa-image" title="Cover & Remark" />
      <Field label="Cover Image">
        <ImagePicker
          ownerType={ownerType}
          ownerId={ownerId}
          role="cover"
          value={f.cover_image_file}
          focus={f.cover_image_focus}
          onFocusChange={(focus) => u("cover_image_focus", focus)}
          onChange={(key, imageId) => {
            u("cover_image_file", key);
            u("pending_image_id", ownerId ? null : imageId);
          }}
        />
      </Field>
      <Field label="Remark">
        <textarea
          className={inputCls}
          rows={3}
          aria-label="Remark"
          value={f.remark ?? ""}
          onChange={(e) => u("remark", e.target.value)}
          placeholder="Private notes..."
        />
      </Field>
    </>
  );
}
