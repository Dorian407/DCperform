# DC Perform

Application de préparation physique DC Perform, installable sur téléphone (web app, sans App Store).

- **Espace joueur** : séance du jour, programme du cycle (salle ou maison), séance guidée avec vidéos et minuteur de récup, forme du jour (3 touches), retour de séance (RPE, question perso du coach, douleurs), bilan du dimanche.
- **Espace coach** : tableau de bord (charge, nuits, alertes), fiche athlète, bibliothèque d'exercices avec vidéos et équivalents maison, import des cycles préparés avec Claude, gestion des joueurs.

Démo sans compte : ajouter `?demo=joueur` ou `?demo=coach` à l'adresse de l'appli. Rien n'est enregistré.

## Organisation du dépôt

| Dossier | Contenu |
| --- | --- |
| `public/` | L'appli telle qu'elle est mise en ligne (pas d'étape de build). |
| `supabase/schema.sql` | Tables, règles d'accès et automatismes de la base. |
| `supabase/seed_exercises.sql` | Bibliothèque de départ (198 exercices). |
| `cycles/` | Non versionné : les cycles des joueurs contiennent des données personnelles. |

## Mise en place (une seule fois)

1. **Supabase > SQL Editor** : coller et exécuter `supabase/schema.sql`, puis `supabase/seed_exercises.sql`.
2. **Compte coach** : dans le SQL Editor, exécuter (avec ton e-mail) :
   ```sql
   insert into public.invitations (email, role, full_name) values ('ton-email@exemple.fr', 'coach', 'Ton nom');
   ```
   puis créer ton compte dans l'appli avec ce même e-mail.
3. **Cloudflare Pages** : connecter ce dépôt, framework « None », commande de build vide, dossier de sortie `public`.
4. **Supabase > Authentication > URL Configuration** : mettre l'adresse Cloudflare (ex. `https://dcperform.pages.dev`) dans *Site URL* et dans *Redirect URLs*.

## Ajouter un joueur

Espace coach > Joueurs > Ajouter (nom + e-mail), puis lui envoyer le message proposé. Il crée son compte avec cet e-mail, confirme par mail, et ajoute l'appli à son écran d'accueil.

## Format d'un cycle à importer

```json
{
  "name": "Cycle 5 · Force-puissance en saison",
  "goal": "…",
  "weeks": 4,
  "week_focus": ["Reprise · RPE 7", "Montée · RPE 8", "Pic · RPE 8", "Allègement · RPE 6"],
  "sessions": [
    {
      "week": 1, "day_offset": 0, "code": "A", "title": "Séance A · Force", "focus": "…",
      "minutes_gym": 75, "minutes_home": 70,
      "gear_gym": ["Trap bar"], "gear_home": ["Haltères"],
      "content_gym": [
        { "name": "Power lower body", "minutes": 20, "format": "Contraste · 4 séries", "sets": 4, "rest": 180,
          "items": [ { "name": "Trap bar deadlift", "dose": "×4 à 80 %" }, { "name": "CMJ", "dose": "×3" } ] }
      ],
      "content_home": null,
      "nutri_tip": "…", "target_rpe": 7
    }
  ]
}
```

`day_offset` = nombre de jours après le lundi de départ choisi à l'import. Les noms d'exercices qui correspondent à la bibliothèque affichent automatiquement leur vidéo et leurs consignes.

## Limites connues (version 1)

- Pas encore de notification la veille : le joueur ouvre l'appli (prévu en version 2).
- Offre gratuite Supabase : le projet se met en pause après une semaine sans activité ; il suffit alors de se connecter au tableau de bord Supabase.
