import Link from "next/link";
import photos from "../../../public/demo/credits.json";
export const metadata = { title: "Demo photo credits" };
export default function Page() {
  return (
    <main id="main-content" className="public-main agency-profile">
      <Link className="back-link" href="/">
        Marketplace home
      </Link>
      <h1>Demo photo credits</h1>
      <p>
        These photographs illustrate our fictional demo listings. They do not
        identify vehicles owned by a partner, and the photographers do not
        endorse Rent2Go.
      </p>
      {photos.map((photo) => (
        <section className="context-section" key={photo.file}>
          <h2>{photo.title}</h2>
          <p>
            Photo by {photo.author}.{" "}
            <a href={photo.licenseUrl}>{photo.license}</a>.
          </p>
          <p>
            <a href={photo.source}>
              View the original description and attribution on Wikimedia Commons
            </a>
          </p>
          <p>{photo.changes}</p>
          <a href={`/demo/${photo.file}`}>Open downloaded original</a>
        </section>
      ))}
    </main>
  );
}
