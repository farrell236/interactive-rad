import type { ReactNode } from 'react'
import { Code2, ExternalLink, FileText, HeartHandshake, ShieldCheck } from 'lucide-react'

const repositoryUrl = 'https://github.com/farrell236/interactive-rad'

const thirdPartyGroups = [
  {
    title: 'Clinical images and datasets',
    items: [
      { name: 'LIDC-IDRI CT data', credit: 'Armato III et al. · The Cancer Imaging Archive', license: 'CC BY 3.0', href: 'https://www.cancerimagingarchive.net/collection/lidc-idri/' },
      { name: 'Normal PA chest radiograph', credit: 'Mikael Häggström · Wikimedia Commons', license: 'CC0 1.0', href: 'https://commons.wikimedia.org/wiki/File:Normal_posteroanterior_%28PA%29_chest_radiograph_%28X-ray%29.jpg' },
      { name: 'CT of abscess and THAD', credit: 'Khaladkar, Bakshi, Bhargava, and Kulkarni', license: 'CC BY 4.0', href: 'https://commons.wikimedia.org/wiki/File:CT_of_abscess_and_THAD.jpg' },
      { name: 'CIE MRI templates', credit: 'Dadar, Camicioli, and Duchesne', license: 'CC BY 4.0', href: 'https://doi.org/10.5281/zenodo.5018356' },
      { name: 'OpenBrain teaching layers', credit: 'OpenBrain v1.0', license: 'CC0', href: 'https://huggingface.co/datasets/openbrain-anon/openbrain_v1_0' },
    ],
  },
  {
    title: 'Illustrations and 3D assets',
    items: [
      { name: 'MRI machine illustration', credit: 'NIAID / Malcolm Houston · NIH BioArt', license: 'Public domain', href: 'https://commons.wikimedia.org/wiki/File:MRI_Machine_(NIH_BioArt_692_-_782415).svg' },
      { name: 'MRI scanner schematic', credit: 'ChumpusRex / Chiswick Chap and contributors', license: 'CC BY-SA 3.0', href: 'https://commons.wikimedia.org/wiki/File:Mri_scanner_schematic_labelled.svg' },
      { name: 'MRI brain T1 image', credit: '511KeV · Wikimedia Commons', license: 'CC BY-SA 4.0', href: 'https://commons.wikimedia.org/wiki/File:MRI_Brain_T1_Axial_(11).jpg' },
      { name: 'Hospital scanner and room meshes', credit: '3D Assets · Hospital Wards and Clinic Operations', license: 'CC0 1.0', href: 'https://3dassets.dev/packs/hospital-wards-and-clinic-operations' },
      { name: 'Anatomical meshes', credit: 'BodyParts3D · Blender adaptation by ogbog', license: 'CC BY-SA', href: 'https://blendswap.com/blend/26915' },
    ],
  },
]

function ExternalTextLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer">{children}<ExternalLink aria-hidden="true" /></a>
}

export default function LegalNotice({ currentYear }: { currentYear: number }) {
  return (
    <article className="legal-page" aria-labelledby="legal-page-title">
      <header className="legal-hero glass-panel">
        <span>Licensing and attribution</span>
        <h1 id="legal-page-title">Licenses &amp; attributions</h1>
        <p>Interactive Radiology keeps its application code open, its original teaching material freely available for noncommercial learning, and every external asset under the terms chosen by its creator.</p>
        <div className="legal-owner"><ShieldCheck aria-hidden="true" /><span>Copyright © {currentYear} Benjamin Hou</span></div>
      </header>

      <section className="legal-license-grid" aria-label="Project licenses">
        <article className="glass-panel">
          <Code2 aria-hidden="true" />
          <div><span>Application source code</span><h2>AGPL-3.0-or-later</h2></div>
          <p>You may inspect, run, modify, and redistribute the code under the GNU Affero General Public License. A modified version offered over a network must offer its corresponding source to its users.</p>
          <div className="legal-link-row">
            <ExternalTextLink href={`${repositoryUrl}/blob/main/LICENSES/AGPL-3.0-or-later.txt`}>Full code license</ExternalTextLink>
            <ExternalTextLink href={repositoryUrl}>Corresponding source</ExternalTextLink>
          </div>
        </article>
        <article className="glass-panel">
          <HeartHandshake aria-hidden="true" />
          <div><span>Original teaching material</span><h2>CC BY-NC-SA 4.0</h2></div>
          <p>Benjamin Hou’s original educational prose and visuals may be shared and adapted noncommercially with attribution, modification notices, and the same license. Commercial redistribution or adaptation requires separate permission.</p>
          <div className="legal-link-row">
            <ExternalTextLink href="https://creativecommons.org/licenses/by-nc-sa/4.0/">License summary</ExternalTextLink>
            <ExternalTextLink href={`${repositoryUrl}/blob/main/LICENSE.md`}>Project scope</ExternalTextLink>
          </div>
        </article>
      </section>

      <section className="legal-attributions glass-panel" aria-labelledby="legal-attributions-title">
        <header>
          <FileText aria-hidden="true" />
          <div><span>Third-party material</span><h2 id="legal-attributions-title">Original licenses remain in force</h2><p>External images, datasets, illustrations, models, and libraries are not relicensed by this project. The concise inventory below links to each primary source.</p></div>
        </header>
        <div className="legal-attribution-groups">
          {thirdPartyGroups.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item.name}>
                    <div><strong>{item.name}</strong><span>{item.credit}</span></div>
                    <ExternalTextLink href={item.href}>{item.license}</ExternalTextLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer>
          <p>Transformation details, dataset identifiers, software dependencies, and the complete inventory are maintained in the repository.</p>
          <ExternalTextLink href={`${repositoryUrl}/blob/main/THIRD_PARTY_NOTICES.md`}>Complete third-party notices</ExternalTextLink>
        </footer>
      </section>

      <aside className="legal-scope-note glass-panel">
        <strong>Scope</strong>
        <p>Visiting or linking to the canonical site does not require permission. The noncommercial restriction applies when the project’s original educational material is copied, redistributed, adapted, or incorporated into another offering. Interactive Radiology is educational software—not a medical device or clinical decision tool.</p>
      </aside>
    </article>
  )
}
