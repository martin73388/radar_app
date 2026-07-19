import { describe, it, expect } from 'vitest'
import { buildPoint } from './pointPourClaude.js'
import { emptyDoc } from '../storage/index.js'

const TODAY = '2026-07-15'

function sampleDoc() {
  const doc = emptyDoc()
  doc.settings.missionEndDate = '2026-12-31'
  doc.companies.push(
    {
      id: 'cmp_1',
      name: 'Wandercraft',
      sector: 'Exosquelettes',
      city: 'Paris',
      notes: "recontacter après l'été",
      type: 'freelance',
      status: 'in_discussion',
      priority: true,
      links: [
        { id: 'lnk_1', url: 'https://ex.com/job', label: 'Lead robotique', postedAt: '2026-07-12' },
      ],
    },
    {
      id: 'cmp_2',
      name: 'Exotec',
      sector: 'Robotique logistique',
      city: 'Lille',
      notes: '',
      type: 'both',
      status: 'to_contact',
      priority: false,
    },
  )
  doc.contacts.push(
    {
      id: 'cnt_1',
      name: 'Jane Doe',
      companyId: 'cmp_1',
      companyName: '',
      role: 'CTO',
      linkedin: 'https://www.linkedin.com/in/janedoe',
      notes: 'très réactive',
      lastContact: '2026-07-10',
      nextFollowUp: '2026-07-17',
    },
    {
      id: 'cnt_2',
      name: 'Marc Dupont',
      companyId: null,
      companyName: 'Recruteur indé',
      role: '',
      notes: '',
      lastContact: null,
      nextFollowUp: '2026-07-14',
    },
  )
  return doc
}

describe('buildPoint', () => {
  it('starts with the date and the mission countdown', () => {
    const text = buildPoint(sampleDoc(), TODAY)
    expect(text.startsWith('📍 POINT RADAR — 15/07/2026')).toBe(true)
    expect(text).toContain('J−169 avant fin de mission, 31/12/2026')
  })

  it('handles a null mission end date without inventing one', () => {
    const text = buildPoint(emptyDoc(), TODAY)
    expect(text).toContain('(fin de mission non définie)')
    expect(text).toContain('🏢 ENTREPRISES (0)')
    expect(text).toContain('👤 CONTACTS (0)')
  })

  it('handles Jour J and overshoot headers', () => {
    const doc = sampleDoc()
    doc.settings.missionEndDate = TODAY
    expect(buildPoint(doc, TODAY)).toContain('Jour J — fin de mission aujourd\'hui')
    doc.settings.missionEndDate = '2026-07-10'
    expect(buildPoint(doc, TODAY)).toContain('fin de mission dépassée de 5 j')
  })

  it('lists every company grouped by status with type/city/sector/notes', () => {
    const text = buildPoint(sampleDoc(), TODAY)
    expect(text).toContain('🏢 ENTREPRISES (2)')
    expect(text).toContain('── En discussion (1)')
    expect(text).toContain('• Wandercraft ⭐ — Freelance — Paris — Exosquelettes')
    expect(text).toContain("  Notes : recontacter après l'été")
    expect(text).toContain('  Annonce : Lead robotique — https://ex.com/job (postée le 12/07/2026)')
    expect(text).toContain('── À contacter (1)')
    expect(text).toContain('• Exotec — Les deux — Lille — Robotique logistique')
  })

  it('lists every contact with company, last contact and next follow-up', () => {
    const text = buildPoint(sampleDoc(), TODAY)
    expect(text).toContain('👤 CONTACTS (2)')
    expect(text).toContain('• Jane Doe — Wandercraft — CTO')
    expect(text).toContain(
      'Dernier contact : 10/07/2026 · Prochaine relance : 17/07/2026 (Dans 2 j)',
    )
    expect(text).toContain('LinkedIn : https://www.linkedin.com/in/janedoe')
    // Free-text company + never contacted + overdue follow-up
    expect(text).toContain('• Marc Dupont — Recruteur indé')
    expect(text).toContain(
      'Dernier contact : jamais · Prochaine relance : 14/07/2026 (En retard de 1 j)',
    )
  })

  it('sorts contacts by follow-up urgency (overdue first)', () => {
    const text = buildPoint(sampleDoc(), TODAY)
    expect(text.indexOf('Marc Dupont')).toBeLessThan(text.indexOf('Jane Doe'))
  })

  it('preserves companies with unknown statuses under a neutral group', () => {
    const doc = sampleDoc()
    doc.companies[1].status = 'from_the_future'
    const text = buildPoint(doc, TODAY)
    expect(text).toContain('── Autre (1)')
    expect(text).toContain('• Exotec')
  })
})
