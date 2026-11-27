# A person's content labels hide the person the way a content rating does

A person carries content labels of their own (`person_content_label`). They
hide the person wherever a content rating above the viewer's mode already
does, and nowhere else: the person's own routes, every list, search and
picker, the cover route, and every page that names them - an entry's
credits, a cast's seiyuu, credit usage. The writers that replace a credit or
cast list wholesale keep a labelled person the editor was not shown.

## Why the rating's footprint, and not a group's

A group's label cascades down because a group *contains* its entries. A
person does not contain the entries they are credited on; the entry is its
own thing, with its own labels. Cascading a person's label onto their entries
would let labelling one voice actor hide a hundred anime, which is not what
anyone asks for when they mark a person. The content rating already answered
"hide this record, keep the entries, leave the record's name off their
pages", so the label takes exactly that footprint rather than inventing a
second one.

The two travel together as one value, `OwnHiding` (`app/services/rbac/
own_hiding.py`): what hides a record by itself, as opposed to by its
connections. Threading a second parameter beside every `hidden_ratings`
argument would have given each reader two things to forget instead of one.
It lives in a module that imports only the models because the credit and
casting services sit below `shared_visibility` in the import graph and need
the type for their defaults.

## Rejected

- **Accepting the labels on `POST` / `PUT /api/person`.** Every other owner's
  labels are written only by `PUT /api/content-labels/<owner>/{id}`, which is
  where the `nsfw` rule and the narrow-editor 404 live. A second writer would
  have to repeat both.
- **Hiding a person only on their own routes.** A label that hid the page but
  left the name on every entry that credits them would hide nothing worth
  hiding.
- **Keeping the survivor's set alone on a merge.** The loser's label hid a
  real person; dropping it on a merge would reveal them. The union cannot
  leak.

## The form placement

On the franchise and entry forms the picker sits in the marks section above
the tab, because those labels are a property of the catalogue row like its
flags. On the person form it sits in the Profile section beside the content
rating, as the owner asked: for a person the label and the rating are the two
halves of one question - who may see this person - and reading them side by
side is the point.
