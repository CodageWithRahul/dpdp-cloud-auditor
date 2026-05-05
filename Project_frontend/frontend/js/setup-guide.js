document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const provider = params.get("provider") || "aws";

  const titleEl = document.getElementById("guideTitle");
  const container = document.getElementById("stepsContainer");
  const backBtn = document.getElementById("back-btn"); // ✅ moved here

  // ------------------------
  // BACK BUTTON FIX
  // ------------------------
  if (backBtn) {
    backBtn.addEventListener("click", () => {

      // safer history check
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = "add_account.html";
      }

    });
  }

  const GUIDES = {
    aws: {
      title: "Connect AWS Account",
      steps: [
        {
          title: "Login to AWS",
          description: "Open AWS Console and sign in",
          action: {
            label: "Open AWS Console",
            url: "https://console.aws.amazon.com/"
          }
        },
        {
          title: "Open IAM",
          description: "Search for IAM in the top search bar"
        },
        {
          title: "Create User",
          description: "Go to Users → Create user"
        },
        {
          title: "Attach Permission",
          description: "Attach this policy",
          highlight: "SecurityAudit"
        },
        {
          title: "Copy Keys",
          description: "Copy Access Key and Secret Key"
        }
      ]
    },

    gcp: {
  title: "Connect your GCP Account",
  steps: [
    {
      title: "Open Google Cloud Console",
      description: "Login to your Google Cloud account. Make sure you're using the correct organization.",
      action: {
        label: "Open Console",
        url: "https://console.cloud.google.com/"
      }
    },
    {
      title: "Select the Project",
      description: "Choose the project you want to scan. This is important because all resources and permissions are tied to this project.",
      tip: "Tip: You can find your project ID in the top navigation bar."
    },
    {
      title: "Enable Required APIs",
      description: "These APIs allow the scanner to read cloud configuration and security settings.",
      highlight: `
• Compute Engine API  
• IAM API  
• Cloud Resource Manager API  
• Service Usage API
      `,
      action: {
        label: "Enable APIs",
        url: "https://console.cloud.google.com/apis/library"
      },
      tip: "Enabling APIs is free. Charges apply only when you use billable services."
    },
    {
      title: "Create a Service Account",
      description: "Service accounts allow secure, programmatic access to your project.",
      action: {
        label: "Go to Service Accounts",
        url: "https://console.cloud.google.com/iam-admin/serviceaccounts"
      }
    },
    {
      title: "Assign Permissions",
      description: "Grant read-only access so the scanner can analyze resources safely.",
      highlight: "Viewer (roles/viewer)",
      tip: "You can add more permissions later if needed for deeper scans."
    },
    {
      title: "Generate JSON Key",
      description: "Create a JSON key file for authentication.",
      highlight: "Keys → Add Key → JSON"
    },
    {
      title: "Upload to Scanner",
      description: "Upload the JSON file here to connect your account securely."
    }
  ]
},

    azure: {
      title: "Connect Azure Account",
      steps: [
        {
          title: "Open Azure Portal",
          action: {
            label: "Open Azure Portal",
            url: "https://portal.azure.com/"
          }
        },
        {
          title: "Go to Azure AD",
          description: "Open Azure Active Directory"
        },
        {
          title: "Register App",
          description: "Create a new app registration"
        },
        {
          title: "Create Secret",
          description: "Generate a client secret"
        },
        {
          title: "Assign Role",
          description: "Assign Reader role"
        },
        {
          title: "Copy Credentials",
          description: "Client ID, Secret, Tenant ID"
        }
      ]
    }
  };

  const guide = GUIDES[provider];


  // ✅ Safe fallback (no illegal return)
  if (!guide) {
    titleEl.textContent = "Guide not found";
    container.innerHTML = "<p>Invalid provider.</p>";
    return;
  }

  titleEl.textContent = guide.title;

  guide.steps.forEach((step, index) => {

    const card = document.createElement("div");
    card.className = "panel step-card"; // use your theme

    card.innerHTML = `
      <div class="step-header">
        <span class="step-number">Step ${index + 1}</span>
        <span class="step-title">${step.title}</span>
      </div>

      <div class="step-desc">${step.description || ""}</div>

      ${step.highlight ? `<div class="highlight">${step.highlight}</div>` : ""}

      ${step.action
        ? `<div class="step-action">
               <button class="btn-primary">
                 ${step.action.label}
               </button>
             </div>`
        : ""
      }
    `;

    // ✅ safer button handler (no inline JS)
    if (step.action) {
      const btn = card.querySelector("button");
      btn.addEventListener("click", () => {
        window.open(step.action.url, "_blank");
      });
    }

    container.appendChild(card);
  });

});

const backBtn = document.getElementById("back-btn");

backBtn.addEventListener("click", () => {

  // If user came from another page → go back
  if (document.referrer && document.referrer !== window.location.href) {
    window.history.back();
  } else {
    // fallback (direct open case)
    window.location.href = "add_account.html";
  }

});