class SmartPhoneFieldFree {
    constructor(options) {
        this.options = options;
        this.init();
    }

    init() {
        this.initSmartPhoneFieldFree();
    }

    initSmartPhoneFieldFree() {
        if (typeof intlTelInput === 'undefined') {
            return;
        }
        const input = document.querySelector(this.options.inputId);

        if (!input) {
            console.warn(`Input element not found: ${this.options.inputId}`);
            return;
        }

        const iti = window.intlTelInput(input, this.configuration());

        input.addEventListener('keypress', function (e) {
            const charCode = e.which ? e.which : e.keyCode;
            if (String.fromCharCode(charCode).match(/[^0-9+]/g)) {
                e.preventDefault();
            }
        });

        // Hidden input to track selected dial code — read by PHP on submission
        let dialCodeInput = input.closest('form')?.querySelector(`input[name="spf_cc_${this.options.fieldId}"]`);
        if (!dialCodeInput) {
            dialCodeInput = document.createElement('input');
            dialCodeInput.type = 'hidden';
            dialCodeInput.name = `spf_cc_${this.options.fieldId}`;
            input.after(dialCodeInput);
        }
        const storageKey = `spf_last_country_${this.options.inputId.replace('#', '')}`;
        this.userChangedCountry = false;
        this.isSubmitted = false;

        const clearAllSpfStorage = () => {
            if (typeof sessionStorage === 'undefined') return;
            this.isSubmitted = true; // Block further saving
            Object.keys(sessionStorage).forEach(key => {
                if (key && key.indexOf('spf_last_country_') === 0) {
                    sessionStorage.removeItem(key);
                }
            });
        };

        const syncDialCode = (event) => {
            if (typeof iti === 'undefined' || !iti) return;

            const countryData = iti.getSelectedCountryData();
            if (countryData && countryData.dialCode) {
                // If it's a countrychange event, mark that the user (or GeoIP) has set it
                if (event && event.type === 'countrychange') {
                    this.userChangedCountry = true;
                    // ONLY save to storage if we haven't submitted the form
                    if (countryData.iso2 && !this.isSubmitted) {
                        sessionStorage.setItem(storageKey, countryData.iso2);
                    }
                }

                const newCode = `+${countryData.dialCode}`;

                // On initial load, don't overwrite the hidden field if it's already correct
                if (!event && dialCodeInput.value && dialCodeInput.value !== '+1' && dialCodeInput.value === newCode) {
                    return;
                }

                if (dialCodeInput.value !== newCode) {
                    dialCodeInput.value = newCode;
                }
            }
        };

        // Check for confirmation page/view or redirect success parameter
        const isConfirmation = document.querySelector('[id^="gform_confirmation_"], .gform_confirmation_wrapper, .gforms_confirmation_message, #gforms_confirmation_message, .gform_confirmation_message, .gform_ajax_spinner + .gform_confirmation_wrapper');
        const isRedirectSuccess = window.location.search.indexOf('spf_success=1') !== -1 || window.location.hash.indexOf('spf_success=1') !== -1;

        if (isConfirmation || isRedirectSuccess) {
            clearAllSpfStorage();
        }

        // Catch cases where the confirmation might render slightly after the script
        setTimeout(() => {
            if (document.querySelector('[id^="gform_confirmation_"], .gform_confirmation_wrapper, .gforms_confirmation_message, #gforms_confirmation_message, .gform_confirmation_message')) {
                clearAllSpfStorage();
            }
        }, 500);

        // Capture initial state immediately
        syncDialCode();

        // Delay a more authoritative sync to allow GeoIP or SessionStorage to finish its work
        setTimeout(() => {
            if (!this.userChangedCountry && !this.isSubmitted) {
                syncDialCode();
            }
        }, 1000);

        input.addEventListener('countrychange', syncDialCode);
        input.addEventListener('input', syncDialCode);
        input.addEventListener('blur', syncDialCode);
        input.addEventListener('keyup', syncDialCode);

        // Final sync before form submission or page change
        const form = input.closest('form');
        if (form) {
            const finalSync = () => {
                syncDialCode({ type: 'submit' });
            };

            const handleSubmitEvent = () => {
                finalSync();
                // We don't set this.isSubmitted = true here yet, 
                // because validation might fail and we want to keep the session.
                // It will be set in clearAllSpfStorage when confirmation starts.
            };

            form.addEventListener('submit', handleSubmitEvent);

            // Explicitly hook into Gravity Forms buttons to ensure sync before AJAX serialization
            const gfButtons = form.querySelectorAll('.gform_next_button, .gform_button, .gform_save_link');
            gfButtons.forEach(btn => {
                btn.addEventListener('click', handleSubmitEvent);
            });

            // Support for Gravity Forms AJAX forms
            jQuery(document).on('gform_process_completed', () => {
                finalSync();
            });

            // Clear storage on successful submission confirmation (AJAX)
            jQuery(document).on('gform_confirmation_loaded', () => {
                clearAllSpfStorage();
            });
        }

        // Global listeners for closing or re-initializing
        document.addEventListener('click', (e) => {
            if (e.target.closest('.kt-modal-close')) {
                clearAllSpfStorage();
            }
        });

        this.addCountryCodeInputHandler(input, iti);

        input.addEventListener('blur', (e) => {
            this.validateNumber(input, iti);
        });

        input.addEventListener('keyup', (e) => {
            this.formatValidation(input, iti);
        });
    }

    configuration() {
        const storageKey = `spf_last_country_${this.options.inputId.replace('#', '')}`;
        const savedCountry = sessionStorage.getItem(storageKey);

        let initialCountry = savedCountry || (this.options.defaultCountry ? String(this.options.defaultCountry).toLowerCase() : 'us');
        if (initialCountry === 'none' || !initialCountry) initialCountry = 'us';

        let config = {
            initialCountry: initialCountry,
            formatOnDisplay: false,
            formatAsYouType: true,
            fixDropdownWidth: true,
            useFullscreenPopup: false
        };

        if (this.options.countrySearch) {
            config.countrySearch = true;
        }

        if (this.options.flag === "flagcode") {
            config.nationalMode = false;
            config.autoHideDialCode = false;
        } else if (this.options.flag === "flagdial" || this.options.flag === "flagwithcode") {
            config.nationalMode = false;
            config.separateDialCode = true;
        } else {
            config.nationalMode = true;
        }

        if (this.options.exIn === 'ex_only') {
            config.onlyCountries = this.options.countries.split(',');
        }

        if (this.options.exIn === 'pre_only') {
            config.excludeCountries = this.options.countries.split(',');
        }

        if (this.options.autoIp) {
            this.detectIPAddress(config);
        }

        if (this.options.placeholder) {
            config.autoPlaceholder = 'off';
        }

        config = gform.applyFilters('gform_spf_options_pre_init', config, this.options.formId, this.options.fieldId);

        return config;
    }

    detectIPAddress(config) {
        const api_url = "https://ipinfo.io/json";
        config.initialCountry = "auto";
        config.geoIpLookup = function (callback) {
            fetch(api_url)
                .then(r => r.json())
                .then(data => {
                    const country = (data && data.country) ? data.country.toLowerCase() : 'us';
                    callback(country);
                })
                .catch(() => callback('us'));
        };
    }

    validateNumber(input, iti) {
        const isValid = iti.isValidNumber();
        const errorMsg = input.parentNode?.parentNode?.querySelector(".error-msg");
        const validMsg = input.parentNode?.parentNode?.querySelector(".valid-msg");

        if (!errorMsg || !validMsg) {
            console.warn('Error or valid message elements not found');
            return;
        }

        if (input.value) {
            if (isValid) {
                errorMsg.classList.add('hide');
                validMsg.classList.remove('hide');
            } else {
                validMsg.classList.add('hide');
                errorMsg.classList.remove('hide');
            }
        } else {
            validMsg.classList.add('hide');
            errorMsg.classList.add('hide');
        }
    }

    formatValidation(input, iti) {
        const isValid = iti.isValidNumber();
        const errorMsg = input.parentNode?.parentNode?.querySelector(".error-msg");
        const validMsg = input.parentNode?.parentNode?.querySelector(".valid-msg");

        if (!errorMsg || !validMsg) {
            console.warn('Error or valid message elements not found');
            return;
        }

        if (input.value) {
            if (isValid) {
                errorMsg.classList.add('hide');
                validMsg.classList.remove('hide');
            } else {
                validMsg.classList.add('hide');
                errorMsg.classList.add('hide');
            }
        } else {
            validMsg.classList.add('hide');
            errorMsg.classList.add('hide');
        }
    }

    addCountryCodeInputHandler(inputElement, iti) {
        if (this.options.flag !== 'flagcode') {
            return;
        }

        const handleCountryChange = (event) => {
            const currentCountryData = iti.getSelectedCountryData();
            const currentCode = `+${currentCountryData.dialCode}`;
            this.updateCountryCodeHandler(event.currentTarget, currentCode);
        };

        inputElement.addEventListener('keydown', handleCountryChange);
        inputElement.addEventListener('input', handleCountryChange);
        inputElement.addEventListener('countrychange', handleCountryChange);
    }

    updateCountryCodeHandler(input, currentCode) {
        let value = input.value;

        if (!currentCode || currentCode === '+undefined' || ['', '+'].includes(value)) {
            return;
        }

        if (!value.startsWith(currentCode)) {
            value = value.replace(/\+/g, '');
            input.value = currentCode + value;
        }
    }
}